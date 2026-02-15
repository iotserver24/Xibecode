# Documentation Template

A fast, modern documentation starter kit featuring a context-aware AI Assistant.

## 🚀 Features

- **🧠 Context-Aware AI Chat**: Queries your documentation to provide accurate, cited answers.
- **⚡ Client-Side RAG**: Powered by [Orama](https://askorama.ai/), enabling instant search without heavy server costs.
- **💬 Premium UI**: Built with Next.js, Tailwind CSS, and Fumadocs.

## 🛠️ Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Docs Engine**: [Fumadocs](https://fumadocs.dev/)
- **AI/LLM**: [LangChain.js](https://js.langchain.com/)
- **Vector Search**: [Orama](https://askorama.ai/)

## 📦 Getting Started

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Configure Secrets**:
   Create `.env.local`:

   ```env
   LLM_BASE_URL="https://api.openai.com/v1"
   LLM_API_KEY="sk-..."
   LLM_MODEL="gpt-3.5-turbo"
   ```

3. **Build Index & Run**:

   ```bash
   npm run build:index
   npm run dev
   ```

4. **Visit**: `http://localhost:3000`

## 📖 adding Content

- Add MDX files to `content/docs`.
- Edit `app/layout.tsx` for layout changes.

## 📄 License

MIT
