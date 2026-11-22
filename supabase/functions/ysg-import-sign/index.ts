Deno.serve(() => new Response(JSON.stringify({error:"upload_closed"}), {status:410,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}));
