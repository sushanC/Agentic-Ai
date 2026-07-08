import { googleProvider } from "../providers/googleProvider.js";
import { groqProvider } from "../providers/groqProvider.js";
import { deepseekProvider } from "../providers/deepseekProvider.js";
import { glmProvider } from "../providers/glmProvider.js";
import { openRouterProvider } from "../providers/openRouterProvider.js";
import { ollamaProvider } from "../providers/ollamaProvider.js";

const providers = {
    google: googleProvider,
    groq: groqProvider,
    deepseek: deepseekProvider,
    glm: glmProvider,
    openrouter: openRouterProvider,
    ollama: ollamaProvider
};

export function getProvider(name){
    return providers[name];
}