"use client";

import { useActionState, useId } from "react";
import { Input, Textarea, Button, Checkbox } from "@rewind-ui/core";
import { createBlog, type CreateBlogState } from "@/lib/actions";
import {
  formControlClasses,
  formErrorClasses,
  formLabelClasses,
} from "@/components/ui/form";
import { primaryButtonClasses } from "@/components/ui/button";
import { contentColumnClasses } from "@/components/ui/layout";

const INITIAL_STATE: CreateBlogState = {};

const CreateBlogForm = () => {
  const [state, formAction] = useActionState(createBlog, INITIAL_STATE);
  const fieldId = useId();

  const titleError = state.fieldErrors?.title?.[0];
  const contentError = state.fieldErrors?.content?.[0];

  return (
    <form
      className={`text-lg mt-2 ${contentColumnClasses}`}
      action={formAction}
    >
      <label htmlFor={`${fieldId}-title`} className={formLabelClasses}>
        Title
      </label>
      <Input
        required
        id={`${fieldId}-title`}
        type="text"
        name="title"
        color="purple"
        className={`${formControlClasses} mt-1`}
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
      <Textarea
        required
        id={`${fieldId}-content`}
        className={`h-[500px] ${formControlClasses} mt-1`}
        tone="solid"
        color="purple"
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

      <Checkbox
        name="private"
        color="purple"
        defaultChecked={state.values?.privateBlog ?? true}
        label="Make this post private"
      />

      <Button
        variant="primary"
        type="submit"
        className={`mt-2 font-bold ${primaryButtonClasses}`}
      >
        Create Post
      </Button>
    </form>
  );
};

export default CreateBlogForm;
