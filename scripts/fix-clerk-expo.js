const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const patches = [
  {
    filePath: path.join(
      repoRoot,
      "node_modules",
      "@clerk",
      "expo",
      "dist",
      "specs",
      "NativeClerkModule.js",
    ),
    before:
      'var NativeClerkModule_default = (_b = (_a = import_react_native.TurboModuleRegistry) == null ? void 0 : _a.get("ClerkExpo")) != null ? _b : null;',
    after:
      'var NativeClerkModule_default = import_react_native.TurboModuleRegistry.get("ClerkExpo");',
  },
  {
    filePath: path.join(
      repoRoot,
      "node_modules",
      "@clerk",
      "expo",
      "src",
      "specs",
      "NativeClerkModule.ts",
    ),
    before: "export default TurboModuleRegistry?.get<Spec>('ClerkExpo') ?? null;",
    after: "export default TurboModuleRegistry.get<Spec>('ClerkExpo');",
  },
];

function patchFile({ filePath, before, after }) {
  if (!fs.existsSync(filePath)) {
    console.log(`skip: ${path.relative(repoRoot, filePath)} not found`);
    return;
  }

  const original = fs.readFileSync(filePath, "utf8");

  if (original.includes(after)) {
    console.log(`ok: ${path.relative(repoRoot, filePath)} already patched`);
    return;
  }

  if (!original.includes(before)) {
    throw new Error(
      `Unexpected Clerk file contents in ${path.relative(repoRoot, filePath)}. Update scripts/fix-clerk-expo.js for the new upstream version.`,
    );
  }

  const updated = original.replace(before, after);
  fs.writeFileSync(filePath, updated, "utf8");
  console.log(`patched: ${path.relative(repoRoot, filePath)}`);
}

for (const patch of patches) {
  patchFile(patch);
}
