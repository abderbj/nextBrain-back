import { Injectable } from '@nestjs/common';
import { ChatCompetionMessageDto } from './dto/create-chat-completion.request';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface LlamaChatMetadata {
    chatId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messages: ChatCompetionMessageDto[];
}

@Injectable()
export class LlamaService {
    private readonly baseUrl = 'http://localhost:11434/api/chat';
    private chats: Record<string, LlamaChatMetadata> = {};

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
        message: ChatCompetionMessageDto
    ): Promise<{ response: string | null }> {
        const chat = this.chats[chatId];
        if (!chat) throw new Error('Chat not found');

        if (chat.messages.length === 0) {
            chat.messages.unshift({
                role: 'system',
                content: 'You are a helpful assistant. Answer clearly and concisely.',
            });
        }


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

        // Send all messages to Llama
        const response = await axios.post(this.baseUrl, {
            model: 'llama3.2',
            messages: chat.messages,
            stream: false,
        });
        console.log('Llama API response:', response.data);

        const aiMessage = response.data.message;
        if (aiMessage && aiMessage.content) {
            chat.messages.push(aiMessage);
            return { response: aiMessage.content };
        }
        return { response: null };
    }

    // Regenerate last assistant response
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
        // Re-send to Llama
        const response = await axios.post(this.baseUrl, {
            model: 'llama3.2',
            messages: chat.messages,
            stream: false,
        });
        const aiMessage = response.data.message;
        if (aiMessage && aiMessage.content) {
            chat.messages.push(aiMessage);
            return { response: aiMessage.content };
        }
        return { response: null };
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