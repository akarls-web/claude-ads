import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <SignUp
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
