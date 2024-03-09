const { Client } = require('pg');
const { headers } = require('../../utils/http-response');
const { clientConfig } = require('../../utils/db-client');

exports.handler = async (event) => {

  const number1 = event.queryStringParameters.number1;
  const number2 = event.queryStringParameters.number2;

  const pgClient = new Client(clientConfig);

  try {
    await pgClient.connect();

    const insertQuery = `
      INSERT INTO numbers (number1, number2)
      VALUES ($1, $2)
      RETURNING id, number1, number2, created_at
    `;

    const result = await pgClient.query(insertQuery, [number1, number2]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Numbers inserted successfully',
        id: result.rows[0].id,
        sum: parseInt(result.rows[0].number1) + parseInt(result.rows[0].number2),
        createdAt: result.rows[0].created_at
      }),
    };
  } catch (error) {
    console.error('Error inserting numbers:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Error inserting numbers',
        error: error.message,
      }),
    };
  } finally {
    await pgClient.end();
  }
};
