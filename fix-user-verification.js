const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixUserVerification() {
  try {
    // Check if user exists and their verification status
    const user = await prisma.user.findUnique({
      where: { email: 'gaithrouahi1730@gmail.com' },
      select: {
        id: true,
        email: true,
        username: true,
        is_verified: true,
        created_at: true
      }
    });

    if (!user) {
      console.log('❌ User gaithrouahi1730@gmail.com not found');
      return;
    }

    console.log('👤 User found:', user);

    if (user.is_verified) {
      console.log('✅ User is already verified');
      return;
    }

    // Check if they have an accepted invitation
    const invitation = await prisma.invitation.findUnique({
      where: { email: 'gaithrouahi1730@gmail.com' },
      select: {
        id: true,
        email: true,
        accepted: true,
        createdAt: true
      }
    });

    console.log('📧 Invitation found:', invitation);

    if (invitation && invitation.accepted) {
      // Update user to be verified
      const updatedUser = await prisma.user.update({
        where: { email: 'gaithrouahi1730@gmail.com' },
        data: { is_verified: true },
        select: {
          id: true,
          email: true,
          username: true,
          is_verified: true
        }
      });

      console.log('✅ User verification status updated:', updatedUser);
    } else {
      console.log('❌ User does not have an accepted invitation');
    }

  } catch (error) {
    console.error('Error fixing user verification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixUserVerification();
