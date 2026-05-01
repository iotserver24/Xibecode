/**
 * Skills Marketplace API Client
 * Connects to https://skills.xibeai.in for searching, downloading, and uploading skills.
 */

const MARKETPLACE_BASE_URL = 'https://skills.xibeai.in';
const UPLOAD_AUTHOR = 'Xibecode';
const UPLOAD_EMAIL = 'xibecode@ai.in';

export interface MarketplaceSkillResult {
    id: string;
    name: string;
    description: string;
    keywords: string[];
    categories: string[];
    qualityScore: number;
    downloads: number;
    downloadUrl: string;
}

export interface MarketplaceSearchResponse {
    type: string;
    query: string;
    results: MarketplaceSkillResult[];
    count: number;
}

export interface MarketplaceUploadResponse {
    success: boolean;
    skillId: string;
    skill: {
        id: string;
        name: string;
        description: string;
        keywords: string[];
        categories: string[];
    };
}

export class MarketplaceClient {
    private baseUrl: string;

    constructor(baseUrl: string = MARKETPLACE_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    /**
     * Search the marketplace for skills
     */
    async searchSkills(query: string = '', limit: number = 10): Promise<MarketplaceSearchResponse> {
        const url = `${this.baseUrl}/api/mcp/skills/search?q=${encodeURIComponent(query)}&limit=${limit}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Marketplace search failed: ${response.status} ${response.statusText}`);
        }

        return await response.json() as MarketplaceSearchResponse;
    }

    /**
     * Download skill content by ID (returns raw markdown)
     */
    async getSkillContent(id: string): Promise<{ content: string; name: string; author: string }> {
        const url = `${this.baseUrl}/api/mcp/skills/${id}/content`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'text/plain' },
        });

        if (!response.ok) {
            throw new Error(`Failed to download skill: ${response.status} ${response.statusText}`);
        }

        const content = await response.text();
        const name = response.headers.get('X-Skill-Name') || 'unknown';
        const author = response.headers.get('X-Skill-Author') || 'unknown';

        return { content, name, author };
    }

    /**
     * Upload a skill to the marketplace
     */
    async uploadSkill(
        content: string,
        skillName?: string,
        authorDescription?: string,
    ): Promise<MarketplaceUploadResponse> {
        const url = `${this.baseUrl}/api/skills/upload`;

        const body = {
            content,
            authorName: UPLOAD_AUTHOR,
            authorEmail: UPLOAD_EMAIL,
            authorDescription: authorDescription || 'XibeCode AI Coding Assistant',
            skillName,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Marketplace upload failed (${response.status}): ${errorBody}`);
        }

        return await response.json() as MarketplaceUploadResponse;
    }
}
