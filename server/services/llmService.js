const axios = require('axios');

const LLM_API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';

function buildCheatDetectionPrompt(prompt, answerWord) {
    return {
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are a game moderator for a drawing quiz game called EGGG. The answer word is "${answerWord}". A player submitted a prompt for AI image generation. Determine if the prompt contains the answer word itself or a direct variation of it (same word in different language, obvious synonym that gives away the answer). Respond with JSON: { "isCheating": boolean, "reason": string, "confidence": number (0-1) }`
            },
            {
                role: 'user',
                content: `Player prompt: "${prompt}"\nAnswer word: "${answerWord}"\nIs this prompt cheating by containing or directly revealing the answer word?`
            }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
    };
}

function buildSimilarityPrompt(userInput, answerWord) {
    return {
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are a semantic similarity judge for a drawing quiz game called EGGG. The correct answer is "${answerWord}". A player submitted a guess. Determine if the guess is semantically equivalent to or a close match for the answer word. Consider synonyms, translations, common misspellings, and contextual meanings. Respond with JSON: { "isCorrect": boolean, "similarity": number (0-1), "reason": string }`
            },
            {
                role: 'user',
                content: `Answer word: "${answerWord}"\nPlayer guess: "${userInput}"\nIs this guess semantically correct?`
            }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
    };
}

async function callLLM(messages) {
    if (!LLM_API_KEY) {
        return simulateLLMResponse(messages);
    }

    try {
        const response = await axios.post(LLM_API_URL, messages, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LLM_API_KEY}`
            },
            timeout: 10000
        });

        if (response.data && response.data.choices && response.data.choices[0]) {
            const content = response.data.choices[0].message.content;
            return JSON.parse(content);
        }

        return null;
    } catch (error) {
        console.error('LLM API call failed:', error.message);
        return simulateLLMResponse(messages);
    }
}

function simulateLLMResponse(messages) {
    const systemContent = messages.messages.find(m => m.role === 'system').content || '';
    const userContent = messages.messages.find(m => m.role === 'user').content || '';

    if (systemContent.includes('cheating') || systemContent.includes('cheat')) {
        const answerMatch = userContent.match(/Answer word: "([^"]+)"/);
        const promptMatch = userContent.match(/Player prompt: "([^"]+)"/);
        if (answerMatch && promptMatch) {
            const answerWord = answerMatch[1].toLowerCase();
            const prompt = promptMatch[1].toLowerCase();
            const isCheating = prompt.includes(answerWord);
            return {
                isCheating,
                reason: isCheating ? `Prompt contains the answer word "${answerWord}"` : 'No direct answer word found in prompt',
                confidence: isCheating ? 0.95 : 0.85
            };
        }
        return { isCheating: false, reason: 'Unable to analyze', confidence: 0.5 };
    }

    if (systemContent.includes('similarity') || systemContent.includes('semantic')) {
        const answerMatch = userContent.match(/Answer word: "([^"]+)"/);
        const guessMatch = userContent.match(/Player guess: "([^"]+)"/);
        if (answerMatch && guessMatch) {
            const answerWord = answerMatch[1].toLowerCase();
            const guess = guessMatch[1].toLowerCase();
            const isExact = guess === answerWord;
            const isContained = answerWord.includes(guess) || guess.includes(answerWord);
            const similarity = isExact ? 1.0 : isContained ? 0.8 : 0.1;
            return {
                isCorrect: isExact || isContained,
                similarity,
                reason: isExact ? 'Exact match' : isContained ? 'Partial match' : 'No semantic match detected'
            };
        }
        return { isCorrect: false, similarity: 0, reason: 'Unable to analyze' };
    }

    return null;
}

async function validatePrompt(prompt, answerWord) {
    const requestBody = buildCheatDetectionPrompt(prompt, answerWord);
    const result = await callLLM(requestBody);
    return result || { isCheating: false, reason: 'Validation failed', confidence: 0 };
}

async function checkSimilarity(userInput, answerWord) {
    const requestBody = buildSimilarityPrompt(userInput, answerWord);
    const result = await callLLM(requestBody);
    return result || { isCorrect: false, similarity: 0, reason: 'Similarity check failed' };
}

module.exports = { validatePrompt, checkSimilarity };