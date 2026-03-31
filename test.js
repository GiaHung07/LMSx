const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyCOm45B_rmlLguVO6oGnT3q_baqY9lJ_OM';
fetch(url, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    contents: [{ parts: [{ text: 'Trích xuất. 1+1=? [0] 2 [1] 3. Format JSON: {\"index\": 0}' }] }],
    generationConfig: { responseMimeType: 'application/json' }
  })
}).then(r=>r.json()).then(x=>console.log(JSON.stringify(x.candidates[0].content.parts[0].text))).catch(console.error);
