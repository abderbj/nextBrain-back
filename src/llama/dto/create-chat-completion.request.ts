import { Type } from "class-transformer";
import { IsArray, isArray, IsNotEmpty, IsString, Validate, ValidateNested } from "class-validator";

export class createChatCompletionRequest {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatCompetionMessageDto)
    messages: ChatCompetionMessageDto[];
}

export class ChatCompetionMessageDto {
    @IsString()
    @IsNotEmpty()
    role: string;

    @IsString()
    @IsNotEmpty()
    content: string;
}