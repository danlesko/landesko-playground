export type User = {
  id: string;
  name: string;
  email: string;
  password: string;
};

export type Blog = {
  id: string;
  title: string;
  content: string;
  date: string;
};

export type NewBlog = {
  title: string;
  content: string;
};

export type Email = {
  name: string;
  email: string;
  message: string;
};
