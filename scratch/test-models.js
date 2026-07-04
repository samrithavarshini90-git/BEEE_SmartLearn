const key = "csk-9xn2wmxr5x9kw4e9389mw8tnj3kkk4p8mdp929h8w6r82x5x";
const models = ["gemma-4-31b", "zai-glm-4.7", "gpt-oss-120b"];

// 1x1 transparent base64 PNG
const testImageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function testModel(model) {
  console.log(`Testing model: ${model}...`);
  const body = {
    model: model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What color is this transparent 1x1 image? Explain in 3 words." },
          { type: "image_url", image_url: { url: testImageBase64 } }
        ]
      }
    ],
    temperature: 0.1
  };

  try {
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });

    const status = res.status;
    const resText = await res.text();
    console.log(`Model ${model} returned Status ${status}:`);
    try {
      const json = JSON.parse(resText);
      if (json.choices) {
        console.log(`-> SUCCESS: ${json.choices[0]?.message?.content}`);
      } else {
        console.log(`-> ERROR CODE: ${json.error?.code || 'unknown'} - ${json.error?.message || resText}`);
      }
    } catch {
      console.log(`-> RAW RESPONSE: ${resText}`);
    }
  } catch (err) {
    console.error(`-> FETCH ERROR:`, err);
  }
  console.log("-".repeat(50));
}

async function main() {
  for (const m of models) {
    await testModel(m);
  }
}

main();
