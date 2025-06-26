import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ChatCompletionMessageDto } from './dto/create-chat-completion.request';
import { v4 as uuidv4 } from 'uuid';

export interface GeminiChatMetadata {
    chatId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messages: ChatCompletionMessageDto[];
}

@Injectable()
export class GeminiService {
    private readonly apiKey = process.env.GEMINI_API_KEY;
    private readonly baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;
    private chats: Record<string, GeminiChatMetadata> = {};

    createChat(title = 'New Chat'): string {
        const chatId = uuidv4();
        const now = new Date();
        this.chats[chatId] = {
            chatId,
            title,
            createdAt: now,
            updatedAt: now,
            messages: [],
        };
        return chatId;
    }

    updateChatTitle(chatId: string, title: string) {
        const chat = this.chats[chatId];
        if (!chat) throw new Error('Chat not found');
        chat.title = title;
        chat.updatedAt = new Date();
    }

    async addMessageAndGetCompletion(
        chatId: string,
        message: ChatCompletionMessageDto
    ): Promise<{ response: string | null }> {
        const chat = this.chats[chatId];
        if (!chat) throw new Error('Chat not found');

        // Set title from first user message
        if (
            chat.messages.length === 0 &&
            message.role === 'user' &&
            chat.title === 'New Chat'
        ) {
            if (typeof message.content === 'string') {
                chat.title = message.content.slice(0, 100);
            }
        }

        chat.messages.push(message);
        chat.updatedAt = new Date();

        // Convert messages to Gemini format
        const geminiMessages = chat.messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        try {
            const { data } = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                { contents: geminiMessages },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (responseText) {
                const aiMessage: ChatCompletionMessageDto = {
                    role: 'assistant',
                    content: responseText
                };
                chat.messages.push(aiMessage);
                return { response: responseText };
            }
            return { response: null };
        } catch (error) {
            console.error('Gemini API error:', error.response?.data || error.message);
            throw new Error('Failed to get response from Gemini');
        }
    }

    async regenerateLastResponse(chatId: string): Promise<{ response: string | null }> {
        const chat = this.chats[chatId];
        if (!chat) throw new Error('Chat not found');
        
        // Remove last assistant message
        for (let i = chat.messages.length - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'assistant') {
                chat.messages.splice(i, 1);
                break;
            }
        }

        // Convert messages to Gemini format
        const geminiMessages = chat.messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        try {
            const { data } = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                { contents: geminiMessages },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (responseText) {
                const aiMessage: ChatCompletionMessageDto = {
                    role: 'assistant',
                    content: responseText
                };
                chat.messages.push(aiMessage);
                return { response: responseText };
            }
            return { response: null };
        } catch (error) {
            console.error('Gemini API error:', error.response?.data || error.message);
            throw new Error('Failed to get response from Gemini');
        }
    }

    getChat(chatId: string) {
        return this.chats[chatId] ?? null;
    }

    listChats() {
        return Object.values(this.chats).map(({ chatId, title, createdAt, updatedAt }) => ({
            chatId,
            title,
            createdAt,
            updatedAt,
        }));
    }
}