const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`현재 Node.js ${process.versions.node}입니다. 이 프로젝트는 Node.js 22.12 이상에서 실행하도록 구성했습니다.`);
  process.exit(1);
}
