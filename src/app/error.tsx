"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="loading-page"><h1>We couldn’t load this view.</h1><p>Please retry. If this is a new installation, complete the setup described in the README.</p><button className="btn primary" onClick={reset}>Try again</button></main>;}
