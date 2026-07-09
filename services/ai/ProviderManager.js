import { googleProvider } from "../providers/googleProvider.js";
import { groqProvider } from "../providers/groqProvider.js";
import { deepseekProvider } from "../providers/deepseekProvider.js";
import { glmProvider } from "../providers/glmProvider.js";
import { openRouterProvider } from "../providers/openRouterProvider.js";
import { ollamaProvider } from "../providers/ollamaProvider.js";

const providers = Object.freeze({
    google: googleProvider,
    groq: groqProvider,
    deepseek: deepseekProvider,
    glm: glmProvider,
    openrouter: openRouterProvider,
    ollama: ollamaProvider
});

export function getProvider(name) {
    const provider = providers[name];

    if (!provider) {
        throw new Error(`Unknown provider: ${name}`);
    }

    return provider;
}

export function hasProvider(name) {
    return name in providers;
}

export function getAllProviders() {
    return providers;
}

export function getProviderNames() {
    return Object.keys(providers);
}

export function getProviderEntries() {
    return Object.entries(providers);
}

export default providers;