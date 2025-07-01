export class InvitationResponseDto {
  id: number;
  email: string;
  accepted: boolean;
  createdAt: Date;
  expiresAt: Date | null;
}
