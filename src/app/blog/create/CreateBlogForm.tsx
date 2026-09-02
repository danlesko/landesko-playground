"use client";

import { useActionState, useId } from "react";
import { createBlog, type CreateBlogState } from "@/lib/actions";
import {
  formCheckboxClasses,
  formCheckboxLabelClasses,
  formInputClasses,
  formTextareaClasses,
  formErrorClasses,
  formLabelClasses,
} from "@/components/ui/form";
import { primaryButtonClasses } from "@/components/ui/button";

const INITIAL_STATE: CreateBlogState = {};

const CreateBlogForm = () => {
  const [state, formAction] = useActionState(createBlog, INITIAL_STATE);
  const fieldId = useId();

  const titleError = state.fieldErrors?.title?.[0];
  const contentError = state.fieldErrors?.content?.[0];

  return (
    <form className="text-lg mt-2" action={formAction}>
      <label htmlFor={`${fieldId}-title`} className={formLabelClasses}>
        Title
      </label>
      <input
        required
        id={`${fieldId}-title`}
        type="text"
        name="title"
        className={`${formInputClasses} mt-1`}
        defaultValue={state.values?.title}
        aria-describedby={`${fieldId}-title-error`}
        aria-invalid={titleError ? true : undefined}
      />
      {/* Each message element is always in the tree and empty when valid: a
          live region that is inserted at the same moment it gains text is the
          less dependable of the two shapes across assistive tech. Keeping it
          mounted also keeps every aria-describedby target resolvable. */}
      <p
        id={`${fieldId}-title-error`}
        aria-live="polite"
        className={formErrorClasses}
      >
        {titleError}
      </p>

      <label htmlFor={`${fieldId}-content`} className={formLabelClasses}>
        Content
      </label>
      <textarea
        required
        id={`${fieldId}-content`}
        className={`h-[500px] ${formTextareaClasses} mt-1`}
        placeholder="What's On Your Mind?"
        name="content"
        defaultValue={state.values?.content}
        aria-describedby={`${fieldId}-content-error`}
        aria-invalid={contentError ? true : undefined}
      />
      <p
        id={`${fieldId}-content-error`}
        aria-live="polite"
        className={formErrorClasses}
      >
        {contentError}
      </p>

      {/* A native checkbox and a real `<label htmlFor>`, replacing rewind-ui's Checkbox.
          The association is the platform's rather than an `aria-labelledby` pointing at a
          generated id, and the label is readable: the library hardcoded a light-mode grey
          that measured about 1.7:1 on this background, against the 4.5:1 that 16px text
          needs.

          No top margin here, deliberately. The library's root was a flex row with none, so
          adding one moved the control -- an earlier version of this did, by 8px, which is
          not something a component swap should do.

          It also drops a two-element wrapper the library used to hold its label; a flex row
          does not need it. That wrapper is why #144 had to widen the Tailwind source globs
          to reach component implementation files, so this removes the cause rather than
          working around it. The utilities involved are described rather than named, because
          comments in this file are scanned and naming them would keep emitting their
          rules. */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id={`${fieldId}-private`}
          name="private"
          defaultChecked={state.values?.privateBlog ?? true}
          className={formCheckboxClasses}
        />
        <label
          htmlFor={`${fieldId}-private`}
          className={formCheckboxLabelClasses}
        >
          Make this post private
        </label>
      </div>

      <button
        type="submit"
        className={`mt-2 font-bold ${primaryButtonClasses}`}
      >
        Create Post
      </button>
    </form>
  );
};

export default CreateBlogForm;
