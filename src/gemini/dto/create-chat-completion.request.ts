import { Type } from "class-transformer";
import { IsArray, isArray, IsNotEmpty, IsString, Validate, ValidateNested } from "class-validator";

export class createChatCompletionRequest {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatCompletionMessageDto)
    messages: ChatCompletionMessageDto[];
}

export class ChatCompletionMessageDto {
    @IsString()
    @IsNotEmpty()
    role: string;

    @IsString()
    @IsNotEmpty()
    content: string;
}