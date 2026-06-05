exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (_) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, nome, cognome, compleanno, citta } = data;

  if (!email || !nome || !cognome || !compleanno || !citta) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Tutti i campi sono obbligatori.' }) };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email,
        attributes: {
          NOME:       nome,
          COGNOME:    cognome,
          COMPLEANNO: compleanno,
          CITTA:      citta
        },
        listIds:       [46],
        updateEnabled: true
      })
    });

    if (res.status === 201 || res.status === 204) {
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    const err = await res.json();
    return { statusCode: res.status, body: JSON.stringify({ error: err.message || 'Errore Brevo' }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Errore di rete' }) };
  }
};
