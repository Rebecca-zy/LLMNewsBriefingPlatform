const { generateBriefing } = require("./lib/generator");

const maxItemsArg = process.argv[2];

generateBriefing({ maxItems: maxItemsArg })
  .then((briefing) => {
    // eslint-disable-next-line no-console
    console.log(
      [
        "简报生成完成",
        `ID: ${briefing.id}`,
        `标题: ${briefing.title}`,
        `候选: ${briefing.totalCandidates}`,
        `入选: ${briefing.selectedCount}`,
        `失败源: ${(briefing.failures || []).length}`,
      ].join("\n")
    );
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`简报生成失败: ${error.message}`);
    process.exitCode = 1;
  });
