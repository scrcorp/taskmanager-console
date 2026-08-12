import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // tsconfig 의 jsx: "preserve" 는 JSX 변환을 Next 에 맡긴다는 뜻이다.
  // vitest 는 Next 를 안 거치므로 그대로 두면 구식(React.createElement) 으로 변환돼
  // `import React` 가 없는 파일이 로드 시점에 "React is not defined" 로 터진다.
  // 그러면 테스트가 실패하는 게 아니라 **파일 전체가 안 돌고 조용히 초록불이 된다.**
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    css: false,
  },
});
