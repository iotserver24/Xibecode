import { restore } from '@orama/plugin-data-persistence';
import { search } from '@orama/orama';
import fs from 'fs';
import path from 'path';

// Load the index once into memory
const INDEX_PATH = path.join(process.cwd(), 'public', 'search-index.json');
let oramaDB: any = null;

async function getOramaDB() {
    if (oramaDB) return oramaDB;
    try {
        const data = fs.readFileSync(INDEX_PATH, 'utf-8');
        oramaDB = await restore('json', data);
        return oramaDB;
    } catch (e) {
        console.error("❌ Orama index not found. Did you run 'npm run build:index'?");
        return null;
    }
}

// Pre-warm DB on module load
getOramaDB();

export async function POST(req: Request) {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1].content;

    // RAG Retrieval (parallel with nothing - just fast)
    const db = await getOramaDB();
    let context = "";
    let sourcesPayload: { title: string; url: string }[] = [];

    if (db) {
        const searchResult = await search(db, { term: lastMessage, limit: 5, tolerance: 2 });
        context = searchResult.hits
            .map((h: any) => `## ${h.document.title}\n${h.document.description ? `Summary: ${h.document.description}\n` : ''}${h.document.content}`)
            .join("\n\n---\n\n");
        sourcesPayload = searchResult.hits.map((h: any) => ({
            title: h.document.title as string,
            url: h.document.url as string
        }));
    }

    // Build messages for API
    const systemPrompt = `You are the XibeCode documentation assistant. XibeCode is an AI-powered autonomous coding assistant for the terminal and browser, with 13 agent modes, 40+ built-in tools, MCP protocol support, and a modern WebUI.

Answer questions using the documentation context below. Be concise and helpful.

Documentation Context:
${context || "No specific documentation matched this query."}

Rules:
- Answer based on the context provided. If the context doesn't cover the question, say what you know about XibeCode from the context and suggest they check the docs.
- For greetings or general questions, introduce yourself as the XibeCode docs assistant and offer to help with installation, configuration, agent modes, tools, WebUI, MCP, plugins, or examples.
- Always be helpful, never say "I am a large language model" or identify as anything other than the XibeCode docs assistant.
- Add a 📚 References section with markdown links at the end when you reference specific docs pages.`;

    const apiMessages = [
        { role: "system", content: systemPrompt },
        ...messages.slice(-6).map((m: any) => ({ role: m.role, content: m.content }))
    ];

    // Direct OpenAI-compatible API call (faster than LangChain)
    const response = await fetch(`${process.env.LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LLM_API_KEY}`
        },
        body: JSON.stringify({
            model: process.env.LLM_MODEL || "gpt-3.5-turbo",
            messages: apiMessages,
            stream: true,
            temperature: 0
        })
    });

    if (!response.body) {
        return new Response("No response", { status: 500 });
    }

    // Stream SSE response directly
    const transformStream = new ReadableStream({
        async start(controller) {
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            const json = JSON.parse(data);
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                controller.enqueue(new TextEncoder().encode(content));
                            }
                        } catch { }
                    }
                }
            }
            controller.close();
        }
    });

    return new Response(transformStream, {
        headers: {
            'X-Search-Term': encodeURIComponent(lastMessage),
            'X-Sources-Count': sourcesPayload.length.toString(),
            'X-Sources': JSON.stringify(sourcesPayload)
        }
    });
}
