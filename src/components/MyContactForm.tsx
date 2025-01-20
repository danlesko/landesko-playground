"use client";
import { useState, ChangeEvent, FormEventHandler, useRef } from "react";
import {
  Textarea,
  Input,
  Button,
  ToastContainer,
  useToast,
} from "@rewind-ui/core";
import emailjs from "@emailjs/browser";
import { Email } from "./types";
import ReCAPTCHA from "react-google-recaptcha";

const MyContactForm = () => {
  const toast = useToast();
  const recaptcha = useRef<ReCAPTCHA | null>(null);
  const [userInput, setUserInput] = useState<Email>({
    name: "",
    email: "",
    message: "",
  });

  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setUserInput({
      ...userInput,
      [name]: value,
    });
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setIsSendingEmail(true);
    const captchaValue = recaptcha.current?.getValue();
    if (!captchaValue) {
      alert("Please verify the reCAPTCHA!");
      setIsSendingEmail(false);
      return;
    } else {
      // make form submission
      console.log("what the fuck?");
      const res = await fetch("http://localhost:3000/api/recaptcha", {
        method: "POST",
        body: JSON.stringify({ captchaValue }),
        headers: {
          "content-type": "application/json",
        },
      });
      const data = await res.json();
      console.log(data);
      if (data.message === "Success") {
        // make form submission
        toast.add({
          color: "green",
          tone: "solid",
          iconType: "success",
          description: "Successfully emailed Dan!",
        });
      } else {
        alert("reCAPTCHA validation failed!");
        recaptcha.current?.reset();
        setIsSendingEmail(false);
        return;
      }
    }

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
      recaptcha.current?.reset();
      setIsSendingEmail(false);
    } catch (error) {
      console.error("Failed to send message. Please try again later.", error);
    }
  };

  return (
    <>
      <form className="text-lg mt-2 w-1/2 h-1/2" onSubmit={handleSubmit}>
        <Input
          required
          disabled={isSendingEmail}
          value={userInput.name}
          type="text"
          name="name"
          color="purple"
          placeholder="Name"
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0"
          onChange={handleChange}
        />
        <Input
          required
          disabled={isSendingEmail}
          value={userInput.email}
          type="email"
          name="email"
          color="purple"
          placeholder="Email"
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0 mt-1"
          onChange={handleChange}
        />
        <Textarea
          required
          disabled={isSendingEmail}
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0 mt-1"
          tone="solid"
          color="purple"
          placeholder="Ask me anything!"
          name="message"
          value={userInput.message}
          onChange={handleChange}
        />
        <ReCAPTCHA
          theme="dark"
          ref={recaptcha}
          sitekey={process.env.NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA || ""}
        />
        <Button
          variant="primary"
          type="submit"
          className="mt-1"
          disabled={isSendingEmail}
          loading={isSendingEmail}
        >
          Send Message
        </Button>
      </form>
      <ToastContainer />
    </>
  );
};

export default MyContactForm;
