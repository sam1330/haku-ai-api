const aiService = require('../src/services/aiService');

async function testVertex() {
    console.log('Testing Vertex AI Connection...');
    try {
        const result = await aiService.generateCoverLetter(
            "Software Engineer with 5 years experience in Node.js and React.",
            "Looking for a Senior Software Engineer to lead our backend team.",
            "TechCorp",
            "Senior Software Engineer",
            "professional",
            "short"
        );
        console.log('Success!');
        console.log('Cover Letter Preview:', result.coverLetter.substring(0, 100) + '...');
        console.log('Tokens Used:', result.tokensUsed);
        console.log('Cost:', result.cost);
    } catch (error) {
        console.error('Test Failed:', error.message);
    }
}

testVertex();
