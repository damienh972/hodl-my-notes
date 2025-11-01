jest.mock("@inquirer/prompts", () => {
  const actualModule = jest.requireActual("@inquirer/prompts");

  return {
    ...actualModule,
    input: jest.fn(),
    editor: jest.fn(),
    confirm: jest.fn(),
    select: jest.fn(),
    password: jest.fn(),
    checkbox: jest.fn(),
  };
});

process.env.EDITOR = "echo";
process.env.VISUAL = "echo";