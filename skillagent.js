require("dotenv").config();
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "deepseek/deepseek-v4-flash";

// 1. 基础工具集 (原子操作)
const tools = {
  get_time: {
    description: "获取当前系统时间",
    args: "无参数",
    execute: () => new Date().toString(),
  },
  calculate: {
    description: "数学运算",
    args: "a, b, operator",
    execute: (args) => eval(`${args.a} ${args.operator || "+"} ${args.b}`),
  },
  create_file: {
    description: "创建文件",
    args: "filename, content",
    execute: (args) => {
      const filePath = path.join(__dirname, args.filename + ".txt");
      fs.writeFileSync(filePath, args.content);
      return `文件 ${args.filename}.txt 已创建。`;
    },
  },
  update_file: {
    description: "更新文件",
    args: "filename, content",
    execute: (args) => {
      const filePath = path.join(__dirname, args.filename + ".txt");
      if (!fs.existsSync(filePath)) throw new Error("文件不存在");
      fs.appendFileSync(filePath, "\n" + args.content);
      return `文件 ${args.filename}.txt 已更新。`;
    },
  },
};

// 2. Skill 定义 (SOP 指令 + 逻辑)
// 技能不仅仅是工具，它是教导 Agent 如何“聪明地”使用工具
const skills = {
  file_expert: {
    description:
      "文件管理专家技能（支持智能判断文件是否存在，自动选择创建或更新）",
    instruction: `使用 file_expert 技能时：
    1. 你必须先思考文件是否可能已存在。
    2. 如果不确定，先尝试调用 update_file，如果报错不存在，再调用 create_file。
    3. 每次操作文件前，必须先调用 get_time 获取时间戳记录在内容中。`,
    // 技能可以拥有自己的快捷逻辑函数
    execute: async (args, currentTools) => {
      // 这里可以写复杂的自动化逻辑，或者干脆让 Agent 按照上面的 instruction 自己跑
      return "请按照 file_expert 的指令指南进行操作。";
    },
  },
};

// 3. 封装 Fetch 调用
async function askModel(messages) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        response_format: { type: "json_object" },
      }),
    },
  );
  const data = await response.json();
  return data.choices[0].message.content;
}

// 4. Agent 核心逻辑
async function startAgent(query) {
  console.log(`--- 用户问题: ${query} ---`);

  // 格式化工具描述
  const toolsDesc = Object.entries(tools)
    .map(
      ([name, conf]) => `- ${name}: ${conf.description} (参数: ${conf.args})`,
    )
    .join("\n");

  // 格式化技能描述和 SOP 指令
  const skillsDesc = Object.entries(skills)
    .map(
      ([name, conf]) =>
        `### 技能: ${name}\n说明: ${conf.description}\n操作指南: ${conf.instruction}`,
    )
    .join("\n\n");

  let messages = [
    {
      role: "system",
      content: `你是一个具备专业技能的智能 Agent。
      
      【输出要求】
      必须返回 JSON 格式：
      {
        "thought": "你的思考过程",
        "action": "调用的工具名或技能名",
        "action_input": { "参数名": "值" },
        "final_answer": "任务完成后的最终回答"
      }

      【可用工具】
      ${toolsDesc}

      【专业技能 SOP】
      ${skillsDesc}

      根据问题，优先考虑是否符合技能 SOP。如果符合，请按照技能指南步骤行动。`,
    },
    { role: "user", content: query },
  ];

  let step = 0;
  //while (true) {
  while (step < 10) {
    step++;
    const rawResponse = await askModel(messages);
    let res;
    try {
      res = JSON.parse(rawResponse);
    } catch (e) {
      messages.push({ role: "user", content: "格式错误，请输出纯净的 JSON。" });
      continue;
    }

    if (res.thought) console.log(`> 思考: ${res.thought}`);
    if (res.final_answer) {
      console.log(`✅ 结果: ${res.final_answer}`);
      break;
    }

    // 处理工具或技能执行
    let observation;
    const actionName = res.action;

    if (tools[actionName]) {
      try {
        observation = await tools[actionName].execute(res.action_input);
      } catch (error) {
        observation = `错误: ${error.message}`;
      }
    } else if (skills[actionName]) {
      // 执行技能的逻辑（如果有）
      observation = await skills[actionName].execute(res.action_input, tools);
    } else {
      observation = "错误: 未找到该工具或技能。";
    }

    console.log(`> 执行 [${actionName}], 观察到: ${observation}`);
    messages.push({ role: "assistant", content: rawResponse });
    messages.push({ role: "user", content: `观察结果: ${observation}` });
  }
}

// 运行
startAgent(
  "使用 file_expert 技能，把今天的日期和它的号码减去 100 写入 test 文件",
);
