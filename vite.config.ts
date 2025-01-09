import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [sveltekit()],
    server: {
        port: 3000
    },
    ssr: {
        noExternal: ['@google/generative-ai']
    },
    define: {
        'process.env.MONGO_URI': JSON.stringify(process.env.MONGO_URI || 'dummy_uri'),
    }
});