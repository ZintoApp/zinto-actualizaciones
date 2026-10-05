import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { Plan } from "@/hooks/use-available-plans";
import { PriceDisplay } from "@/components/ui/price-display";

interface PlanCardProps {
  plan: Plan;
  isCurrentPlan: boolean;
  onSelectPlan: (plan: Plan) => void;
}

export function PlanCard({ plan, isCurrentPlan, onSelectPlan }: PlanCardProps) {
  return (
    <Card className={`w-full ${isCurrentPlan ? 'border-primary border-2' : ''}`}>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <PriceDisplay
            plan={plan as any}
            size="lg"
            showDiscountBadge={true}
            showSavings={true}
            layout="vertical"
          />
        </div>
        <ul className="space-y-2">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-center">
              <Check className="h-4 w-4 mr-2 text-secondry" />
              <span>{feature}</span>
            </li>
          ))}
          <li className="flex items-center">
            <Check className="h-4 w-4 mr-2 text-secondry" />
            <span>{plan.maxUsers} team members</span>
          </li>
          <li className="flex items-center">
            <Check className="h-4 w-4 mr-2 text-secondry" />
            <span>{plan.maxContacts.toLocaleString()} contacts</span>
          </li>
          <li className="flex items-center">
            <Check className="h-4 w-4 mr-2 text-secondry" />
            <span>{plan.maxChannels} channels</span>
          </li>
          <li className="flex items-center">
            <Check className="h-4 w-4 mr-2 text-secondry" />
            <span>{plan.maxFlows} flows</span>
          </li>
        </ul>
      </CardContent>
      <CardFooter>
        {isCurrentPlan ? (
          <Button className="w-full" variant="outline" disabled>
            Plan Active
          </Button>
        ) : (
          <Button className="w-full btn-brand-primary"  onClick={() => onSelectPlan(plan)}>
            Select Plan
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
