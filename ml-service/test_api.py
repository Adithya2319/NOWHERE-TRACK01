import unittest
from fastapi.testclient import TestClient
from app.main import app

class ForecastTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        self.assertFalse(self.client.get('/health').json()['trained'])

    def test_forecast_and_missing(self):
        data = self.client.post('/predict', json={'assessments':[{'maximum':20,'score':10},{'maximum':60}]}).json()
        self.assertEqual(data['projected_percentage'], 50)
        self.assertEqual(data['coverage'], 25)
        self.assertIsNone(self.client.post('/predict', json={'assessments':[{'maximum':20}]}).json()['projected_percentage'])

    def test_invalid_marks(self):
        for score in [-1,21]:
            self.assertEqual(self.client.post('/predict', json={'assessments':[{'maximum':20,'score':score}]}).status_code, 422)
        self.assertEqual(self.client.post('/predict', json={'assessments':[]}).status_code, 422)

if __name__ == '__main__':
    unittest.main()
