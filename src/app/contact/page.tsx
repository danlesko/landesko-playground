'use client';
import { useState, useEffect } from "react";
import {Textarea} from "@rewind-ui/core";

export default function Contact() {
  const [contactValue, setContactValue] = useState<string | null>(null);

  useEffect(()=> {
    console.log(contactValue);
  }, [contactValue]);

  return (
    <>
      <h2 className="text-4xl font-bold">Contact</h2>
      <p className="text-lg mt-2">
        Email me directly at: {" "}
        <a className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
          href="mailto:lesko.dan.m@gmail.com">
            lesko.dan.m@gmail.com
          </a>
      </p>
      <p className="text-lg mt-2 w-1/2 h-1/2">
        Or through the web here:
        <Textarea className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0" tone="solid" color="purple" placeholder="Ask me anything!" onChange={(e) => setContactValue(e.target.value)}/>
      </p>
    </>
  );
}
