const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateExistingChats() {
  try {
    // Since we can't easily distinguish between existing Gemini and Llama chats,
    // we'll set all existing chats to GEMINI by default
    // Users can create new Llama chats if needed
    const result = await prisma.chatbotConversation.updateMany({
      where: {
        model_type: null // Update chats that don't have a model_type set
      },
      data: {
        model_type: 'GEMINI'
      }
    });

    console.log(`Updated ${result.count} existing chats to GEMINI model type`);
  } catch (error) {
    console.error('Error updating existing chats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateExistingChats();
