const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkExistingChats() {
  try {
    // Check all existing chats
    const chats = await prisma.chatbotConversation.findMany({
      select: {
        id: true,
        title: true,
        model_type: true,
        started_at: true
      }
    });

    console.log(`Found ${chats.length} existing chats:`);
    chats.forEach(chat => {
      console.log(`- Chat ${chat.id}: "${chat.title}" (${chat.model_type}) - ${chat.started_at}`);
    });

    // Check if any chats have null model_type
    const nullChats = chats.filter(chat => chat.model_type === null);
    console.log(`\nChats with null model_type: ${nullChats.length}`);

  } catch (error) {
    console.error('Error checking existing chats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkExistingChats();
