import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 15,
  duration: '1m',
};

export default function () {
  const res = http.get('https://offcampus-backend2.onrender.com/api/health');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'health check is OK': (r) => r.body.includes('"ok":true'),
  });

  sleep(1);
}