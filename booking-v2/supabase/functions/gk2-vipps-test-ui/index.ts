// Supabase Edge Functions explicitly do NOT serve HTML (rewritten to text/plain).
// Redirect old test link to the same user's GitHub Pages static test page instead.
// No secrets, login capture, booking write, or payment action in this function.
const page="https://msvendsen87.github.io/golfkongen-booking/vipps-test.html";
Deno.serve((req:Request)=>{
 if(req.method!=="GET")return new Response("Method Not Allowed",{
  status:405,headers:{"allow":"GET","cache-control":"no-store"}});
 const pathname=new URL(req.url).pathname;
 if(pathname!=="/gk2-vipps-test-ui")return new Response("Not Found",{status:404});
 return new Response(null,{status:302,headers:{
   "Location":page,
   "cache-control":"no-store, max-age=0",
   "referrer-policy":"no-referrer",
   "x-content-type-options":"nosniff"
 }});
});
