"use client";
import { useState, ChangeEvent } from "react";
import { Textarea, Input, Button } from "@rewind-ui/core";
import emailjs from "@emailjs/browser";

type Email = {
  name: string;
  email: string;
  message: string;
};

export default function Contact() {
  const [userInput, setUserInput] = useState<Email>({
    name: "",
    email: "",
    message: "",
  });

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setUserInput({
      ...userInput,
      [name]: value,
    });
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    const serviceID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID
      ? process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID
      : "";
    const templateID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID
      ? process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID
      : "";
    const userID = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY
      ? process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY
      : "";

    try {
      const emailParams = {
        name: userInput.name,
        email: userInput.email,
        message: userInput.message,
      };

      const res = await emailjs.send(
        serviceID,
        templateID,
        emailParams,
        userID,
      );

      if (res.status === 200) {
        console.log("Message sent successfully!");
        setUserInput({
          name: "",
          email: "",
          message: "",
        });
      }
    } catch (error) {
      console.error("Failed to send message. Please try again later.", error);
    }
  };

  return (
    <>
      <h2 className="text-4xl font-bold">Contact</h2>
      <p className="text-lg mt-2">
        Email me directly at:{" "}
        <a
          className="text-blue-600 hover:text-blue-800 visited:text-purple-600"
          href="mailto:lesko.dan.m@gmail.com"
        >
          lesko.dan.m@gmail.com
        </a>
      </p>
      <p className="text-lg mt-2">Or through the web here:</p>
      <form className="text-lg mt-2 w-1/2 h-1/2" onSubmit={handleSubmit}>
        <Input
          value={userInput.name}
          type="text"
          name="name"
          color="purple"
          placeholder="Name"
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0"
          onChange={handleChange}
        />
        <Input
          value={userInput.email}
          type="email"
          name="email"
          color="purple"
          placeholder="Email"
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0 mt-1"
          onChange={handleChange}
        />
        <Textarea
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0 mt-1"
          tone="solid"
          color="purple"
          placeholder="Ask me anything!"
          name="message"
          value={userInput.message}
          onChange={handleChange}
        />
        <Button type="submit">Send Message</Button>
      </form>
    </>
  );
}
