import { defineConfig } from "vitest/config";
import * as path from "path";
export default defineConfig({
    test: {
        environment: "node",
        globals: false,
        include: ["test/**/*.test.ts"]
    },
    resolve: {
        alias: {
            "@src": path.resolve(__dirname, "src")
        }
    }
});
//# sourceMappingURL=vitest.config.mjs.map