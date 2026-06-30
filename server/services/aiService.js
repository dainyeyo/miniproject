const axios = require('axios');

const API_BASE_URL = process.env.AI_IMAGE_API_URL || 'https://image.pollinations.ai/prompt';

async function generateImage(prompt) {
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `${API_BASE_URL}/${encodedPrompt}`;

    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000
        });

        if (response.status === 200) {
            const base64Image = Buffer.from(response.data, 'binary').toString('base64');
            const dataUri = `data:image/png;base64,${base64Image}`;
            return { success: true, imageUrl: dataUri, prompt };
        }

        return { success: false, error: `API responded with status ${response.status}`, prompt };
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            return { success: false, error: 'Request timeout', prompt };
        }
        return { success: false, error: error.message, prompt };
    }
}

function buildPrompt(keyword, style) {
    const styleMap = {
        cute: 'cute kawaii cartoon, pastel colors, simple line art',
        funny: 'funny cartoon style, exaggerated features, bright colors',
        abstract: 'abstract art, modern style, creative interpretation',
        detailed: 'detailed illustration, rich colors, high quality',
        sketch: 'pencil sketch style, black and white, rough lines'
    };

    const styleInstruction = styleMap[style] || styleMap.cute;
    return `${keyword}, ${styleInstruction}, white background, game art`;
}

module.exports = { generateImage, buildPrompt };