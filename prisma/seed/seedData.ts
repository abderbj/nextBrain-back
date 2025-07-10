import { PrismaClient, ModelType, SenderType, Role, AccountType, User, ChatbotConversation } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

// Dummy data generators
const generateUsers = async () => {
  const users = [
    {
      username: 'admin',
      email: 'admin@nextora.com',
      password_hash: await hash('admin123', 10),
      full_name: 'Admin User',
      profile_image: null,
      bio: 'System Administrator',
      location: 'San Francisco, CA',
      is_verified: true,
      account_type: AccountType.PUBLIC,
      role: Role.ADMIN,
    },
    {
      username: 'john_doe',
      email: 'john.doe@example.com',
      password_hash: await hash('password123', 10),
      full_name: 'John Doe',
      profile_image: null,
      bio: 'Cloud Solutions Architect',
      location: 'New York, NY',
      is_verified: true,
      account_type: AccountType.PUBLIC,
      role: Role.USER,
    },
    {
      username: 'jane_smith',
      email: 'jane.smith@example.com',
      password_hash: await hash('password123', 10),
      full_name: 'Jane Smith',
      profile_image: null,
      bio: 'Cybersecurity Specialist',
      location: 'Austin, TX',
      is_verified: true,
      account_type: AccountType.PUBLIC,
      role: Role.USER,
    },
    {
      username: 'alex_wilson',
      email: 'alex.wilson@example.com',
      password_hash: await hash('password123', 10),
      full_name: 'Alex Wilson',
      profile_image: null,
      bio: 'DevOps Engineer',
      location: 'Seattle, WA',
      is_verified: true,
      account_type: AccountType.PRIVATE,
      role: Role.USER,
    },
    {
      username: 'sarah_johnson',
      email: 'sarah.johnson@example.com',
      password_hash: await hash('password123', 10),
      full_name: 'Sarah Johnson',
      profile_image: null,
      bio: 'Data Scientist & AI Researcher',
      location: 'Boston, MA',
      is_verified: true,
      account_type: AccountType.PUBLIC,
      role: Role.USER,
    }
  ];

  return users;
};

const generateConversations = (userIds: number[]) => {
  const geminiTitles = [
    'Cloud Security Best Practices',
    'Kubernetes Deployment Strategies',
    'AI Ethics in Healthcare',
    'Microservices Architecture Design',
    'Data Privacy Compliance Guide',
    'Machine Learning Model Optimization',
    'Zero Trust Network Architecture',
    'Serverless Computing Benefits',
    'Container Orchestration Tips',
    'API Gateway Configuration'
  ];

  const llamaTitles = [
    'Network Penetration Testing',
    'Docker Container Security',
    'Threat Intelligence Analysis',
    'Incident Response Planning',
    'Vulnerability Assessment Methods',
    'Blockchain Security Audit',
    'GDPR Compliance Checklist',
    'Cloud Migration Strategy',
    'Identity Access Management',
    'Cyber Threat Modeling'
  ];

  const conversations: any[] = [];
  const now = new Date();

  userIds.forEach(userId => {
    // Generate 3-8 conversations per user
    const numConversations = Math.floor(Math.random() * 6) + 3;
    
    for (let i = 0; i < numConversations; i++) {
      const isGemini = Math.random() > 0.5;
      const titles = isGemini ? geminiTitles : llamaTitles;
      const title = titles[Math.floor(Math.random() * titles.length)];
      
      // Generate random date in the last 30 days
      const daysAgo = Math.floor(Math.random() * 30);
      const startedAt = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      
      conversations.push({
        user_id: userId,
        title,
        model_type: isGemini ? ModelType.GEMINI : ModelType.LLAMA,
        started_at: startedAt,
        updated_at: new Date(startedAt.getTime() + (Math.random() * 24 * 60 * 60 * 1000))
      });
    }
  });

  return conversations;
};

const generateMessages = (conversationIds: number[]) => {
  const userQuestions = [
    "How do I implement zero-trust security in my cloud infrastructure?",
    "What are the best practices for container security?",
    "Can you explain the differences between symmetric and asymmetric encryption?",
    "How do I set up proper logging and monitoring for my microservices?",
    "What are the key principles of secure coding?",
    "How can I improve my API security?",
    "What should I consider when migrating to the cloud?",
    "How do I implement proper backup and disaster recovery?",
    "What are the latest cybersecurity threats I should be aware of?",
    "How do I ensure GDPR compliance in my application?",
    "What are the benefits of using Infrastructure as Code?",
    "How do I implement proper authentication and authorization?",
    "What are the security implications of using third-party libraries?",
    "How can I automate my security testing?",
    "What are the best practices for incident response?"
  ];

  const botResponses = [
    "Great question! Let me break down the key components of a zero-trust security model for you...",
    "Container security involves several layers. Here are the essential practices you should implement...",
    "The fundamental difference lies in the key distribution mechanism. Let me explain both approaches...",
    "Effective logging and monitoring for microservices requires a comprehensive strategy. Here's what I recommend...",
    "Secure coding principles are crucial for preventing vulnerabilities. The main principles include...",
    "API security is multi-faceted. Here are the critical security measures you should implement...",
    "Cloud migration requires careful planning. Let me outline the key considerations for a secure migration...",
    "A robust backup and disaster recovery strategy should include these components...",
    "The cybersecurity landscape is constantly evolving. Here are the current threats you should monitor...",
    "GDPR compliance requires attention to several key areas. Let me guide you through the requirements...",
    "Infrastructure as Code offers significant advantages. Here are the key benefits and implementation tips...",
    "Authentication and authorization are fundamental security controls. Here's how to implement them properly...",
    "Third-party dependencies can introduce security risks. Here's how to manage them effectively...",
    "Security testing automation is essential for modern development. Here are the tools and practices I recommend...",
    "Incident response planning is critical for minimizing damage. Here's a comprehensive framework..."
  ];

  const messages: any[] = [];
  
  conversationIds.forEach(conversationId => {
    // Generate 2-8 message pairs per conversation
    const numPairs = Math.floor(Math.random() * 7) + 2;
    
    for (let i = 0; i < numPairs; i++) {
      const baseTime = new Date(Date.now() - (Math.random() * 30 * 24 * 60 * 60 * 1000));
      
      // User message
      messages.push({
        conversation_id: conversationId,
        sender_type: SenderType.USER,
        message: userQuestions[Math.floor(Math.random() * userQuestions.length)],
        sent_at: new Date(baseTime.getTime() + (i * 10 * 60 * 1000)) // 10 minutes apart
      });
      
      // Bot response
      messages.push({
        conversation_id: conversationId,
        sender_type: SenderType.BOT,
        message: botResponses[Math.floor(Math.random() * botResponses.length)],
        sent_at: new Date(baseTime.getTime() + (i * 10 * 60 * 1000) + (2 * 60 * 1000)) // 2 minutes after user message
      });
    }
  });

  return messages;
};

const generateInvitations = () => {
  const invitations = [
    {
      email: 'pending1@example.com',
      token: 'token_' + Math.random().toString(36).substring(2, 15),
      expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)), // 7 days from now
      accepted: false,
    },
    {
      email: 'pending2@example.com',
      token: 'token_' + Math.random().toString(36).substring(2, 15),
      expiresAt: new Date(Date.now() + (5 * 24 * 60 * 60 * 1000)), // 5 days from now
      accepted: false,
    },
    {
      email: 'expired@example.com',
      token: 'token_' + Math.random().toString(36).substring(2, 15),
      expiresAt: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)), // 2 days ago (expired)
      accepted: false,
    }
  ];

  return invitations;
};

export const seedDatabase = async () => {
  console.log('🌱 Starting database seeding...');

  try {
    // Clear existing data (be careful in production!)
    console.log('🧹 Cleaning existing data...');
    await prisma.chatbotMessage.deleteMany();
    await prisma.chatbotConversation.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.user.deleteMany();

    // Create users
    console.log('👥 Creating users...');
    const usersData = await generateUsers();
    const users: User[] = [];
    for (const userData of usersData) {
      const user = await prisma.user.create({ data: userData });
      users.push(user);
    }
    console.log(`✅ Created ${users.length} users`);

    // Create invitations
    console.log('📧 Creating invitations...');
    const invitationsData = generateInvitations();
    const invitations = await prisma.invitation.createMany({ data: invitationsData });
    console.log(`✅ Created ${invitations.count} invitations`);

    // Create conversations
    console.log('💬 Creating conversations...');
    const userIds = users.map(user => user.id);
    const conversationsData = generateConversations(userIds);
    const conversations: ChatbotConversation[] = [];
    for (const convData of conversationsData) {
      const conversation = await prisma.chatbotConversation.create({ data: convData });
      conversations.push(conversation);
    }
    console.log(`✅ Created ${conversations.length} conversations`);

    // Create messages
    console.log('📝 Creating messages...');
    const conversationIds = conversations.map(conv => conv.id);
    const messagesData = generateMessages(conversationIds);
    const messages = await prisma.chatbotMessage.createMany({ data: messagesData });
    console.log(`✅ Created ${messages.count} messages`);

    // Summary
    console.log('\n📊 Seeding Summary:');
    console.log(`👥 Users: ${users.length}`);
    console.log(`📧 Invitations: ${invitations.count}`);
    console.log(`💬 Conversations: ${conversations.length}`);
    console.log(`📝 Messages: ${messages.count}`);
    
    const geminiConversations = conversations.filter(c => c.model_type === ModelType.GEMINI).length;
    const llamaConversations = conversations.filter(c => c.model_type === ModelType.LLAMA).length;
    console.log(`🤖 Gemini conversations: ${geminiConversations}`);
    console.log(`🦙 Llama conversations: ${llamaConversations}`);

    console.log('\n🎉 Database seeding completed successfully!');
    
    return {
      users: users.length,
      invitations: invitations.count,
      conversations: conversations.length,
      messages: messages.count,
      geminiConversations,
      llamaConversations
    };

  } catch (error) {
    console.error('❌ Error during database seeding:', error);
    throw error;
  }
};
