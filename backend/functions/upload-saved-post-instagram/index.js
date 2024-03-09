exports.handler = async (event) => {

  // pass user ID...
  try {
    const fbApiUrl = 'https://graph.facebook.com/v19.0/me?fields=id,name&access_token=EAAUUkraVSJYBOwovhUWXDKQFyOVyZAaoQ2BXZCvjkqdRrLBZCEwSHscN4MmN6ZB3qcAmOCTRngFI9tHzdyE2SfDcmTLYoMn4EAs9yvDZBYyuQYeAomj0Mkr6gPHTlUmOllq0nzE3k4TZBBIiPH7MpZAOZBrDztT75oZC3S9woZCBYFjSrSslc8ZBplRsUCHqmODpLmsZBdJAt6nxFSF3KDvhpPoxkqkMDW6XYo0pmYkgD5l0880jdXWzxlEpaLVDliJgvwZDZD';

    const response = await fetch(fbApiUrl, {
      method: 'GET',
    });

    response = await response.json();

    console.log('response:', response);

  } catch (error) {
    console.error('Error:', error);
  }

};
