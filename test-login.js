const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function testLogin() {
  try {
    // Get user details
    const user = await prisma.user.findUnique({
      where: { email: 'gaithrouahi1730@gmail.com' },
      select: {
        id: true,
        username: true,
        email: true,
        password_hash: true,
        is_verified: true,
        account_type: true,
        role: true
      }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('👤 User details:');
    console.log({
      id: user.id,
      username: user.username,
      email: user.email,
      is_verified: user.is_verified,
      account_type: user.account_type,
      role: user.role,
      has_password_hash: !!user.password_hash
    });

    // Test password verification (you'll need to replace 'your_test_password' with the actual password)
    const testPassword = 'password123'; // Replace with the actual password used during registration
    const isPasswordValid = await bcrypt.compare(testPassword, user.password_hash);
    console.log('🔐 Password validation test:', isPasswordValid);

  } catch (error) {
    console.error('Error testing login:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLogin();
