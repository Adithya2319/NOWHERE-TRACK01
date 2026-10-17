import { writeFileSync } from 'node:fs';
const backend=process.argv[2];
if(!backend||!/^https:\/\/[^/]+\/?$/.test(backend))throw Error('Supply a reachable persistent HTTPS backend origin, e.g. npm run deploy:prepare -- https://campus-api.your-domain.com');
const origin=backend.replace(/\/$/,'');
const config={$schema:'https://openapi.vercel.sh/vercel.json',buildCommand:'npm run build',outputDirectory:'dist',rewrites:[{source:'/api/:path*',destination:`${origin}/api/:path*`},{source:'/:path*',destination:'/index.html'}],headers:[{source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store, max-age=0'},{key:'CDN-Cache-Control',value:'no-store'},{key:'Vercel-CDN-Cache-Control',value:'no-store'}]}]};
writeFileSync('vercel.json',JSON.stringify(config,null,2)+'\n');
writeFileSync('netlify.toml',`[build]\ncommand = "npm run build"\npublish = "dist"\n\n[[redirects]]\nfrom = "/api/*"\nto = "${origin}/api/:splat"\nstatus = 200\nforce = true\n\n[[redirects]]\nfrom = "/*"\nto = "/index.html"\nstatus = 200\n\n[[headers]]\nfor = "/api/*"\n[headers.values]\nCache-Control = "no-store"\n`);
console.log('Prepared Vercel and Netlify API rewrites. Nothing was published. Verify proxy cookies and the backend persistent disk before deployment.');
