import { Controller, Post, Body, Param, Patch, Get, Delete, HttpException, HttpStatus, Req, Query } from '@nestjs/common';
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
        @Body() body: any,
    @Query('assistant') assistant?: string,
    @Query('assistantCategoryId') assistantCategoryId?: string,
    ) {

        // Support two payload shapes for compatibility:
        // 1) { messages: [ { role, content }, ... ] }
        // 2) { role: 'user', content: '...' }  (single message)
        let messages: ChatCompletionMessageDto[] | undefined;

        if (body && Array.isArray(body.messages)) {
            messages = body.messages;
        } else if (body && typeof body.role === 'string' && typeof body.content === 'string') {
            messages = [ { role: body.role, content: body.content } as ChatCompletionMessageDto ];
        }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new HttpException('Request body must have a non-empty "messages" array', HttpStatus.BAD_REQUEST);
        }

        // Get the last message (latest user input)
        const lastMessage = messages[messages.length - 1];

        if (!lastMessage || typeof lastMessage.role !== 'string' || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
            throw new HttpException('Invalid message: role and content are required.', HttpStatus.BAD_REQUEST);
        }

        try {
            let categoryId: number | undefined;
            if (assistant === 'general') {
                categoryId = undefined;
            } else if (assistantCategoryId && assistantCategoryId.trim() !== '') {
                const parsed = parseInt(assistantCategoryId, 10);
                categoryId = Number.isNaN(parsed) ? undefined : parsed;
            } else {
                categoryId = undefined;
            }

            return await this.geminiService.addMessageAndGetCompletion(parseInt(chatId, 10), lastMessage, categoryId);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Post(':chatId/regenerate')
    async regenerate(
        @Param('chatId') chatId: string,
        @Query('assistant') assistant?: string,
        @Query('assistantCategoryId') assistantCategoryId?: string
    ) {
        try {
            let categoryId: number | undefined;
            if (assistant === 'general') {
                categoryId = undefined;
            } else if (assistantCategoryId) {
                categoryId = parseInt(assistantCategoryId);
            } else {
                categoryId = undefined;
            }
            return await this.geminiService.regenerateLastResponse(parseInt(chatId), categoryId);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Get(':chatId')
    async getChat(@Param('chatId') chatId: string, @Req() req: RequestWithUser): Promise<GeminiChatMetadata> {
        const chat = await this.geminiService.getChat(parseInt(chatId), req.user.id);
        if (!chat) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        return chat;
    }

    @Get()
    async listChats(@Req() req: RequestWithUser) {
        return await this.geminiService.listChats(req.user.id);
    }

    @Delete('all')
    async deleteAllChats(@Req() req: RequestWithUser) {
        try {
            const deletedCount = await this.geminiService.deleteAllChats(req.user.id);
            return { success: true, message: `${deletedCount} chats deleted successfully` };
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Delete(':chatId')
    async deleteChat(@Param('chatId') chatId: string, @Req() req: RequestWithUser) {
        try {
            await this.geminiService.deleteChat(parseInt(chatId), req.user.id);
            return { success: true, message: 'Chat deleted successfully' };
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }
}