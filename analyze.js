// api/analyze.js
// 이 파일은 Vercel 서버에서만 실행됩니다. API 키가 절대 브라우저(고객 화면)에 노출되지 않습니다.
// Google Gemini API를 사용합니다 (무료 티어 사용 가능).

export default async function handler(req, res) {
  // 아임웹 페이지에서 이 서버로 요청을 보낼 수 있도록 허용 (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '허용되지 않은 요청 방식입니다.' });
  }

  try {
    const { images, styleName, styleDesc } = req.body;

    if (!images || !Array.isArray(images) || images.length < 3) {
      return res.status(400).json({ error: '이미지는 최소 3장 이상 필요합니다.' });
    }
    if (images.length > 12) {
      return res.status(400).json({ error: '이미지는 최대 12장까지 분석 가능합니다.' });
    }

    const imageParts = images.map((b64) => ({
      inline_data: { mime_type: 'image/jpeg', data: b64 },
    }));

    const prompt =
      '당신은 패션 브랜드의 인스타그램 피드를 큐레이션하는 전문가입니다. ' +
      '아래 이미지들은 한 브랜드가 보유한 실제 사진들입니다. ' +
      `선택된 레퍼런스 스타일은 "${styleName}" (${styleDesc}) 입니다. ` +
      '이 스타일 톤에 가장 잘 맞는 순서로 이미지 인덱스(0부터 시작)를 최대 9개 선택하고, 3x3 그리드에 배치할 순서를 정하세요. ' +
      '또한 왜 이 톤을 추천하는지, 어떤 보정 방향(밝기/채도/색감)을 제안하는지 2~3문장으로 설명하세요. ' +
      'JSON 형식으로만 응답하세요, 다른 텍스트 없이: {"order": [숫자배열], "note": "설명 텍스트"}';

    const apiKey = process.env.GEMINI_API_KEY;
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [...imageParts, { text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'Gemini API 오류: ' + errText.slice(0, 300) });
    }

    const data = await response.json();

    const candidate = data.candidates && data.candidates[0];
    const textPart = candidate && candidate.content && candidate.content.parts &&
      candidate.content.parts.find((p) => p.text);

    if (!textPart) {
      return res.status(500).json({ error: '분석 결과를 받지 못했습니다: ' + JSON.stringify(data).slice(0, 300) });
    }

    let parsed;
    try {
      const clean = textPart.text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(500).json({ error: '결과 형식을 해석하지 못했습니다. 원본: ' + textPart.text.slice(0, 300) });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: '서버 오류: ' + (err.message || String(err)) });
  }
}
