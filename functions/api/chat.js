function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const authorization = request.headers.get("Authorization") || "";

  if (authorization !== `Bearer ${env.WORKBENCH_ACCESS_TOKEN}`) {
    return json({ error: "访问口令不正确" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不正确" }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "请输入问题" }, 400);
  }

  const messages = body.messages
    .slice(-12)
    .filter((item) => item && ["user", "assistant"].includes(item.role))
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").slice(0, 4000),
    }));

  if (!messages.some((item) => item.role === "user" && item.content.trim())) {
    return json({ error: "请输入有效问题" }, 400);
  }

  const systemPrompt = `你是智慧医疗业务部的行业研究助手，主要服务招聘负责人。
请使用简洁、专业、容易理解的中文回答，重点覆盖国内外智慧医疗公司、核心业务、医疗信息化、互联网医疗、AI医疗、医院数字化、体重管理、商业模式、竞争格局和人才需求。
回答要求：先给结论，再分点说明；不确定的信息必须明确标注，不得编造；涉及最新资讯时说明当前版本尚未接入实时网页搜索；不提供医疗诊断或治疗建议；不要索取或输出候选人敏感个人信息。`;

  let upstream;
  try {
    upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        max_tokens: 1200,
        temperature: 0.3,
        stream: false,
      }),
    });
  } catch {
    return json({ error: "暂时无法连接 DeepSeek，请稍后再试" }, 502);
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return json({ error: data?.error?.message || "DeepSeek 服务返回错误，请检查余额和密钥" }, upstream.status);
  }

  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) return json({ error: "没有收到有效回答" }, 502);

  return json({ answer, usage: data.usage || null });
}

export function onRequest() {
  return json({ error: "Not found" }, 404);
}

