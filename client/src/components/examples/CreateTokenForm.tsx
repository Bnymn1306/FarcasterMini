import { CreateTokenForm } from '../CreateTokenForm';

export default function CreateTokenFormExample() {
  return (
    <div className="p-8">
      <CreateTokenForm 
        onSubmit={(data) => console.log('Token created:', data)}
      />
    </div>
  );
}
