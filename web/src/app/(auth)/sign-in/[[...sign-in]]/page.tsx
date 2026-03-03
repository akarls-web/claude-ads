import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-md rounded-lg border border-border-light",
            headerTitle: "text-text-primary font-bold",
            headerSubtitle: "text-text-secondary",
            formButtonPrimary:
              "bg-brand hover:bg-brand-light focus-visible:ring-2 focus-visible:ring-brand",
          },
        }}
      />
    </div>
  );
}
