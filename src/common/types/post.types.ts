import { AccountType, PostCategory } from '@prisma/client';

export interface PostWithUser {
  id: number;
  content: string | null;
  image_urls: string[];
  category: PostCategory;
  view_count: number;
  created_at: Date;
  updated_at: Date;
  user_id: number;
  user: {
    id: number;
    account_type: AccountType;
  };
}
