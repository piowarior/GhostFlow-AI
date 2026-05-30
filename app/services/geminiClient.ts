/**
 * Gemini API Client
 * Handles API requests to Google Gemini with proper error handling
 */

interface MessageContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface GenerateContentRequest {
  contents: MessageContent[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
}

export class GeminiClient {
  private apiKey: string;
  private apiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
  private conversationHistory: MessageContent[] = [];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Validate API key format
   */
  static validateApiKey(key: string): boolean {
    // Gemini API keys typically start with specific patterns
    // But we'll do a basic validation
    return key.length > 20 && key.length < 200;
  }

  /**
   * Send message and get response
   */
  async sendMessage(userMessage: string, systemPrompt?: string): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key tidak diatur. Silakan masukkan API key di pengaturan.');
      }

      if (!GeminiClient.validateApiKey(this.apiKey)) {
        throw new Error('Format Gemini API key tidak valid. Periksa kembali API key Anda.');
      }

      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });

      // Build request with conversation history
      const request: GenerateContentRequest = {
        contents: this.conversationHistory,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 1024,
        },
      };

      // Add system prompt if provided
      if (systemPrompt) {
        request.contents.unshift({
          role: 'user',
          parts: [{ text: `System: ${systemPrompt}` }],
        });
        request.contents.unshift({
          role: 'model',
          parts: [{ text: 'Understood. I will follow the system instructions.' }],
        });
      }

      const response = await fetch(`${this.apiBaseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;

        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed: ${errorMessage}. API key mungkin sudah expired atau tidak valid.`);
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded. Coba lagi dalam beberapa saat.');
        } else if (response.status === 400) {
          throw new Error(`Bad request: ${errorMessage}`);
        } else {
          throw new Error(`Gemini API error: ${errorMessage}`);
        }
      }

      const data = await response.json();

      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response format from Gemini API');
      }

      const modelResponse = data.candidates[0].content.parts[0].text;

      // Add model response to history for next messages
      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: modelResponse }],
      });

      // Keep conversation history limited (last 10 messages)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return modelResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Gemini API Error:', errorMessage);
      throw new Error(`Gemini API Error: ${errorMessage}`);
    }
  }

  /**
   * Analyze session for ETL filtering
   */
  async analyzeSessionForETL(
    title: string,
    description: string,
    activities: any[]
  ): Promise<{
    relevant_activities: any[];
    filtered_activities: any[];
    analysis_score: number;
    recommendations: string[];
  }> {
    try {
      const prompt = `Analyze this development session and identify which activities are relevant to the project.

Project Title: "${title}"
Description: "${description}"

Activities: ${JSON.stringify(activities.slice(0, 5), null, 2)}

Respond in JSON format:
{
  "relevant_count": number,
  "irrelevant_count": number,
  "confidence": 0-1,
  "key_findings": ["finding1", "finding2"],
  "recommendations": ["rec1", "rec2"]
}`;

      const response = await this.sendMessage(prompt);

      try {
        const parsed = JSON.parse(response);
        return {
          relevant_activities: activities.filter((_, i) => i < parsed.relevant_count),
          filtered_activities: activities.filter((_, i) => i >= parsed.relevant_count),
          analysis_score: parsed.confidence || 0.8,
          recommendations: parsed.recommendations || [],
        };
      } catch {
        return {
          relevant_activities: activities,
          filtered_activities: [],
          analysis_score: 0.5,
          recommendations: ['Unable to parse AI analysis - using all activities'],
        };
      }
    } catch (error) {
      console.error('ETL Analysis error:', error);
      return {
        relevant_activities: activities,
        filtered_activities: [],
        analysis_score: 0,
        recommendations: [`ETL Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Match junior section with expert sections
   */
  async matchSectionWithExperts(
    juniorTitle: string,
    juniorDescription: string,
    expertSections: any[]
  ): Promise<{
    matches: Array<{ expertName: string; sectionTitle: string; relevance: number }>;
    suggestions: string[];
  }> {
    try {
      const prompt = `Given this junior developer's project task, find the most relevant expert session sections.

Junior Task: "${juniorTitle}" - "${juniorDescription}"

Available Expert Sections:
${expertSections.map((s) => `- ${s.expertName}: "${s.title}"`).join('\n')}

Return JSON:
{
  "top_matches": [{"expert": "name", "section": "title", "relevance": 0-1}],
  "learning_tips": ["tip1", "tip2"]
}`;

      const response = await this.sendMessage(prompt);

      try {
        const parsed = JSON.parse(response);
        return {
          matches: parsed.top_matches?.map((m: any) => ({
            expertName: m.expert,
            sectionTitle: m.section,
            relevance: m.relevance || 0.5,
          })) || [],
          suggestions: parsed.learning_tips || [],
        };
      } catch {
        return {
          matches: [],
          suggestions: ['Unable to process expert matching - manual selection recommended'],
        };
      }
    } catch (error) {
      console.error('Section matching error:', error);
      return {
        matches: [],
        suggestions: [`Matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  getHistory(): MessageContent[] {
    return [...this.conversationHistory];
  }

  /**
   * Update API key
   */
  setApiKey(newKey: string): void {
    this.apiKey = newKey;
  }
}
