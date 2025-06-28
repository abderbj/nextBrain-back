import { Controller, Post, Body, Param, Patch, Get, HttpException, HttpStatus, Req } from '@nestjs/common';
import { ChatCompletionMessageDto } from './dto/create-chat-completion.request';
import { GeminiService, GeminiChatMetadata } from './gemini.service';
import { Auth } from '../common/decorators/auth.decorator';
import { RequestWithUser } from '../common/types/auth.types';

@Auth()
@Controller('gemini/chat')
export class GeminiController {
    constructor(private readonly geminiService: GeminiService) {}

    @Post('create')
    async createChat(@Req() req: RequestWithUser, @Body('title') title?: string) {
        const chatId = await this.geminiService.createChat(req.user.id, title);
        return { chatId };
    }

    @Patch(':chatId/title')
    async updateTitle(@Param('chatId') chatId: string, @Body('title') title: string) {
        try {
            await this.geminiService.updateChatTitle(parseInt(chatId), title);
            return { chatId: parseInt(chatId), title };
        } catch (e) {
            throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        }
    }

    @Post(':chatId/message')
    async sendMessage(
        @Param('chatId') chatId: string,
        @Body() body: { messages: ChatCompletionMessageDto[] }
    ) {
        
        if (!body || !body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
            throw new HttpException('Request body must have a non-empty "messages" array', HttpStatus.BAD_REQUEST);
        }

        // Get the last message (latest user input)
        const lastMessage = body.messages[body.messages.length - 1];
        
        if (!lastMessage || typeof lastMessage.role !== 'string' || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
            throw new HttpException('Invalid message: role and content are required.', HttpStatus.BAD_REQUEST);
        }

        try {
            return await this.geminiService.addMessageAndGetCompletion(parseInt(chatId), lastMessage);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Post(':chatId/regenerate')
    async regenerate(@Param('chatId') chatId: string) {
        try {
            return await this.geminiService.regenerateLastResponse(parseInt(chatId));
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Get(':chatId')
    async getChat(@Param('chatId') chatId: string): Promise<GeminiChatMetadata> {
        const chat = await this.geminiService.getChat(parseInt(chatId));
        if (!chat) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        return chat;
    }

    @Get()
    async listChats(@Req() req: RequestWithUser) {
        return await this.geminiService.listChats(req.user.id);
    }
}