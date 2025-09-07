import { Controller, Post, Body, Param, Patch, Get, Delete, HttpException, HttpStatus, Req, Res, Query } from '@nestjs/common';
import { ChatCompletionMessageDto } from './dto/create-chat-completion.request';
import { GeminiService, GeminiChatMetadata } from './gemini.service';
import { Auth } from '../common/decorators/auth.decorator';
import { RequestWithUser } from '../common/types/auth.types';

@Controller('gemini')
export class GeminiController {
    constructor(private readonly geminiService: GeminiService) {}

    // Public health check endpoint (no auth required)
    @Get('health')
    async checkHealth() {
        // Return basic health check since Gemini is a remote API
        return { status: 'ok', service: 'gemini' };
    }

    // All chat endpoints require authentication

    @Auth()
    @Post('chat/create')
    async createChat(@Req() req: RequestWithUser, @Body('title') title?: string, @Query('model') model?: string) {
        const chatId = await this.geminiService.createChat(req.user.id, title);
        return { chatId };
    }

    @Auth()
    @Patch('chat/:chatId/title')
    async updateTitle(@Param('chatId') chatId: string, @Body('title') title: string) {
        try {
            await this.geminiService.updateChatTitle(parseInt(chatId), title);
            return { chatId: parseInt(chatId), title };
        } catch (e) {
            throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        }
    }

    @Auth()
    @Post('chat/:chatId/message')
    async sendMessage(
        @Param('chatId') chatId: string,
        @Body() body: any,
        @Query('assistant') assistant?: string,
        @Query('assistantCategoryId') assistantCategoryId?: string,
        @Query('model') model?: string,
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
        } catch (e: any) {
            // Check if the error is about chat not found
            if (e.message && e.message.includes('Chat not found')) {
                throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
            }
            // For other errors like API issues, throw internal server error
            throw new HttpException(
                e.message || 'Failed to get response from Gemini',
                e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    @Auth()
    @Post('chat/:chatId/message/stream')
    async sendMessageStream(
        @Param('chatId') chatId: string,
        @Body() body: any,
        @Req() req: any,
        @Res() res: any,
        @Query('model') model?: string,
    ) {
        let messages: ChatCompletionMessageDto[] | undefined;

        if (body && Array.isArray(body.messages)) {
            messages = body.messages;
        } else if (body && typeof body.role === 'string' && typeof body.content === 'string') {
            messages = [ { role: body.role, content: body.content } as ChatCompletionMessageDto ];
        }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new HttpException('Request body must have a non-empty "messages" array', HttpStatus.BAD_REQUEST);
        }

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || typeof lastMessage.role !== 'string' || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
            throw new HttpException('Invalid message: role and content are required.', HttpStatus.BAD_REQUEST);
        }

        try {
            // Set headers for Server-Sent Events
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // Determine assistant selection from query params
            const assistant = req?.query?.assistant as string | undefined;
            const assistantCategoryId = req?.query?.assistantCategoryId as string | undefined;
            let categoryId: number | undefined;
            if (assistant === 'general') {
                categoryId = undefined;
            } else if (assistantCategoryId && assistantCategoryId.trim() !== '') {
                const parsed = parseInt(assistantCategoryId, 10);
                categoryId = Number.isNaN(parsed) ? undefined : parsed;
            } else {
                categoryId = undefined;
            }

            // Note: This will throw an error if streaming is not implemented in the service
            await this.geminiService.addMessageAndGetCompletionStream(parseInt(chatId), lastMessage, res, categoryId, model);
        } catch (e) {
            if (!res.headersSent) {
                throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
    }

    @Auth()
    @Post('chat/:chatId/regenerate')
    async regenerate(
        @Param('chatId') chatId: string,
        @Query('assistant') assistant?: string,
        @Query('assistantCategoryId') assistantCategoryId?: string,
        @Query('model') model?: string,
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

    @Auth()
    @Get('chat/:chatId')
    async getChat(@Param('chatId') chatId: string, @Req() req: RequestWithUser): Promise<GeminiChatMetadata> {
        const chat = await this.geminiService.getChat(parseInt(chatId), req.user.id);
        if (!chat) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        return chat;
    }

    @Auth()
    @Get('chat')
    async listChats(@Req() req: RequestWithUser, @Query('model') model?: string) {
        return await this.geminiService.listChats(req.user.id);
    }

    @Auth()
    @Delete('chat/all')
    async deleteAllChats(@Req() req: RequestWithUser) {
        try {
            const deletedCount = await this.geminiService.deleteAllChats(req.user.id);
            return { success: true, message: `${deletedCount} chats deleted successfully` };
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Auth()
    @Delete('chat/:chatId')
    async deleteChat(@Param('chatId') chatId: string, @Req() req: RequestWithUser) {
        try {
            await this.geminiService.deleteChat(parseInt(chatId), req.user.id);
            return { success: true, message: 'Chat deleted successfully' };
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }
}