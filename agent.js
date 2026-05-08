const { create } = require("domain");

// agent_fetch.js
require("dotenv").config();
require("fs");

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "deepseek/deepseek-v4-flash";

// 1. 工具集
const tools = {
  get_weather: {
    description: "获取指定城市的天气情况",
    args: "city: string (城市名称，如'上海')",
    execute: (args) => `城市 ${args.city} 的天气是：晴，22℃`,
  },
  calculate: {
    description: "执行加减乘除数学运算",
    args: "a: number, b: number, operator: string (运算符 '+', '-', '*', '/')",
    execute: (args) => {
      // 简单安全检查
      return eval(`${args.a} ${args.operator || "+"} ${args.b}`);
    },
  },
  get_time: {
    description: "获取当前系统的详细时间",
    args: "无参数",
    execute: () => new Date().toString(),
  },
  create_file: {
    description: "在当前目录下创建一个文本文件",
    args: "filename: string (文件名,不带后缀), content: string (文件内容)",
    execute: (args) => {
      const fs = require("fs");
      const path = require("path");
      const filePath = path.join(
        __dirname,
        args.filename.replace(/[^a-zA-Z0-9_-]/g, "_") + ".txt",
      );
      fs.writeFileSync(filePath, args.content);
      return `文件 ${args.filename}.txt 已创建成功。`;
    },
  },
  update_file: {
    description: "在当前目录下更新/追加一个文本文件",
    args: "filename: string (文件名,不带后缀), content: string (要追加的内容)",
    execute: (args) => {
      const fs = require("fs");
      const path = require("path");
      const filePath = path.join(
        __dirname,
        args.filename.replace(/[^a-zA-Z0-9_-]/g, "_") + ".txt",
      );

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件 ${args.filename}.txt 不存在，请先创建它。`);
      }

      fs.appendFileSync(filePath, "\n" + args.content);
      return `文件 ${args.filename}.txt 已更新，追加了内容。`;
    },
  },
};

// 2. 封装llm调用
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
        // 强制要求模型输出 JSON 格式
        response_format: { type: "json_object" },
      }),
    },
  );

  const data = await response.json();
  return data.choices[0].message.content;
}

// 3. Agent 逻辑
async function startAgent(query) {
  console.log(`--- 用户问题: ${query} ---`);
  const toolsDescription = Object.entries(tools)
    .map(([name, config]) => {
      return `- ${name}: ${config.description}。参数要求: ${config.args}`;
    })
    .join("\n");

  let messages = [
    {
      role: "system",
      content: `你是一个智能 Agent。必须返回 JSON 格式：
            {
              "thought": "你的思考过程",
              "action": "工具名 ",
              "action_input": { "参数名": "值" },
              "final_answer": "任务完成后的最终回答"
            }
            
            你现在有以下工具可用：
           ${toolsDescription}
              根据用户的问题，决定是否需要调用工具。如果需要，返回 action 和 action_input；如果不需要，直接返回 final_answer。
            `,
    },
    { role: "user", content: query },
  ];
  console.log("初始消息:", messages);
  while (true) {
    const rawResponse = await askModel(messages);
    const res = JSON.parse(rawResponse);

    if (res.thought) console.log(`> 思考: ${res.thought}`);

    if (res.final_answer) {
      console.log(`✅ 结果: ${res.final_answer}`);
      break;
    }

    if (res.action && tools[res.action]) {
      try {
        observation = await tools[res.action].execute(res.action_input);
      } catch (error) {
        observation = `执行失败: ${error.message}`;
      }
      console.log(
        `> 执行工具 [${res.action}], 观察到: ${observation.toString()}`,
      );

      messages.push({ role: "assistant", content: rawResponse });
      messages.push({ role: "user", content: `观察结果: ${observation}` });
    }
  }
}

startAgent(
  "修改一个名为 test 的文件，内容是 哈哈哈啊哈哈哈加上今天的日期，下一行内容为今天的日期的号码减去100",
);
