import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({base:'./',plugins:[react()],resolve:{alias:{'@':path.resolve(import.meta.dirname,'.')}},build:{outDir:'web-dist',emptyOutDir:true},server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:8080'}}});
